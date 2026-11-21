import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { notesApi } from "../../api/endpoints";
import { queryKeys } from "../../api/queries";
import { useToast } from "../../components/Feedback";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";

/** Creates an empty note and opens it in the editor. */
export function useCreateNote() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const i18n = useI18n();

  const mutation = useMutation({
    mutationFn: (categoryId: number | null) => notesApi.create({ category_id: categoryId }),
    onSuccess: (note) => {
      client.setQueryData(queryKeys.note(note.id), note);
      client.invalidateQueries({ queryKey: queryKeys.allNotes });
      navigate(`/notes/${note.id}`, { state: { isNew: true } });
    },
    onError: (error) => toast(errorMessage(error, i18n), "error"),
  });

  return {
    createNote: (categoryId: number | null = null) => mutation.mutate(categoryId),
    creating: mutation.isPending,
  };
}
